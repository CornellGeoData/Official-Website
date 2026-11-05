import { useEffect, useState } from 'react';

const QUERY = '(max-width: 720px), (max-width: 1100px) and (max-height: 500px)';

export function useCompactViewport() {
  const [compact, setCompact] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
