import {LeakPhoto, LeakPoint} from '../types/leak';

export const DEFAULT_DRIVE_FOLDER_ID = '15G6uPSGwvr2aPellgNSsvNU7g2O96pPS';
export const DEFAULT_DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_FOLDER_ID}`;

export interface DriveFileSummary {
  id: string;
  name: string;
  webViewLink?: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(parts[1] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], {type: mime});
}

async function fetchImageBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    return dataUrlToBlob(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('ไม่สามารถอ่านข้อมูลรูปภาพสำหรับอัปโหลดได้');
  }
  return res.blob();
}

export async function uploadPhotoToDrive(
  photo: LeakPhoto,
  filename: string,
  folderId: string,
  accessToken: string
): Promise<{driveFileId: string; driveUrl: string}> {
  const blob = await fetchImageBlob(photo.url);
  const metadata = {
    name: filename,
    parents: [folderId],
  };

  const boundary = `hydropin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${blob.type || 'image/jpeg'}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--`;

  const body = new Blob([metaPart, blob, endPart], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error?.message) msg = data.error.message;
    } catch {
      // ignore
    }
    throw new Error(`อัปโหลดภาพขึ้น Google Drive ไม่สำเร็จ: ${msg}`);
  }

  const data = (await res.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    driveFileId: data.id,
    driveUrl:
      data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function uploadPendingPhotosForLeaks(
  leaks: LeakPoint[],
  folderId: string,
  accessToken: string
): Promise<{updatedLeaks: LeakPoint[]; uploadedCount: number}> {
  let uploadedCount = 0;
  const updatedLeaks: LeakPoint[] = [];

  for (const leak of leaks) {
    let changed = false;
    const nextPhotos: LeakPhoto[] = [];

    for (let i = 0; i < leak.photos.length; i++) {
      const photo = leak.photos[i];
      if (photo.driveFileId && photo.driveUrl) {
        nextPhotos.push(photo);
        continue;
      }

      const safeDate = (leak.reportDate || new Date().toISOString().slice(0, 10)).replace(
        /[^0-9-]/g,
        ''
      );
      const filename = `${leak.dma}_NO${leak.no}_${safeDate}_${i + 1}.jpg`;
      const uploaded = await uploadPhotoToDrive(
        photo,
        filename,
        folderId,
        accessToken
      );
      uploadedCount++;
      changed = true;
      nextPhotos.push({
        ...photo,
        driveFileId: uploaded.driveFileId,
        driveUrl: uploaded.driveUrl,
      });
    }

    updatedLeaks.push(changed ? {...leak, photos: nextPhotos} : leak);
  }

  return {updatedLeaks, uploadedCount};
}

export async function findSpreadsheetInDrive(
  folderId: string,
  accessToken: string
): Promise<DriveFileSummary | null> {
  // 1. Search inside the target Drive folder first
  const folderQuery = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const folderRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name,webViewLink)&orderBy=modifiedTime desc&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {headers: {Authorization: `Bearer ${accessToken}`}}
  );

  if (folderRes.ok) {
    const data = (await folderRes.json()) as {files?: DriveFileSummary[]};
    const files = data.files || [];
    if (files.length > 0) {
      const leakMatch = files.find((f) =>
        f.name.toLowerCase().includes('leak')
      );
      return leakMatch || files[0];
    }
  }

  // 2. Fallback: search anywhere in Drive for a spreadsheet named LEAK
  const nameQuery = encodeURIComponent(
    `name contains 'LEAK' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const nameRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${nameQuery}&fields=files(id,name,webViewLink)&orderBy=modifiedTime desc&pageSize=5`,
    {headers: {Authorization: `Bearer ${accessToken}`}}
  );

  if (nameRes.ok) {
    const data = (await nameRes.json()) as {files?: DriveFileSummary[]};
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
  }

  return null;
}

export async function moveFileToDriveFolder(
  fileId: string,
  folderId: string,
  accessToken: string
): Promise<void> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?fields=parents`,
    {headers: {Authorization: `Bearer ${accessToken}`}}
  );
  if (!metaRes.ok) return;
  const meta = (await metaRes.json()) as {parents?: string[]};
  const previousParents = (meta.parents || []).join(',');

  const params = new URLSearchParams({
    addParents: folderId,
    supportsAllDrives: 'true',
  });
  if (previousParents) {
    params.set('removeParents', previousParents);
  }

  await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: {Authorization: `Bearer ${accessToken}`},
    }
  );
}
