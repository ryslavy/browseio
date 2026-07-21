export interface TorrentSource {
  name: string;
  title: string;
  infoHash?: string;
  magnet?: string;
  size?: string;
  seeders?: number;
}

interface RawStream {
  name?: string;
  title?: string;
  infoHash?: string;
  [key: string]: unknown;
}

export async function getTorrentioSources(type: string, id: string): Promise<TorrentSource[]> {
  try {
    const res = await fetch(`https://torrentio.strem.fun/stream/${type}/${id}.json`);
    const data = await res.json();
    
    if (data.streams) {
      return data.streams.map((stream: RawStream) => {
        const titleText = stream.title || '';
        const titleParts = titleText.split('\n');
        const namePart = titleParts[0];
        const infoPart = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';
        
        let seeders = 0;
        let size = 'Unknown';
        
        const seedMatch = infoPart.match(/👤 (\d+)/);
        if (seedMatch) seeders = parseInt(seedMatch[1]);
        
        const sizeMatch = infoPart.match(/💾 ([0-9.]+ [A-Z]+)/);
        if (sizeMatch) size = sizeMatch[1];

        return {
          name: stream.name || 'Torrentio',
          title: namePart,
          infoHash: stream.infoHash,
          size,
          seeders
        };
      });
    }
    return [];
  } catch (error) {
    console.error('Error fetching Torrentio sources:', error);
    return [];
  }
}
