import youtubeDlExec from 'youtube-dl-exec';

console.log('Testing youtube-dl-exec with yt-dlp...');

try {
  const result = await youtubeDlExec('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    getUrl: true,
    format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
  });
  
  console.log('Result type:', typeof result);
  console.log('URL obtained:', result ? result.toString().slice(0, 120) + '...' : 'NONE');
} catch(e) {
  console.error('Failed:', e.message, '\n', e.stderr?.slice(0, 300));
}
