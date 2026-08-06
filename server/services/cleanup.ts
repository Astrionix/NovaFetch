import fs from 'fs';

export function cleanupFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`[NovaFetch Cleanup] Failed to delete temp file ${filePath}:`, err);
      } else {
        console.log(`[NovaFetch Cleanup] Cleaned up temporary file: ${filePath}`);
      }
    });
  }
}
