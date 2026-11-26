import { useEffect, useState } from 'react';

let required = true;
let request;

// The server decides whether admin actions need a password. Ask until it has answered once.
export function useAuthRequired() {
  const [value, setValue] = useState(required);
  useEffect(() => {
    request ||= fetch('/api/auth').then(res => {
      if (!res.ok) throw new Error();
      return res.json();
    }).then(data => { required = data.password_required !== false; }).catch(() => { request = undefined; });
    let mounted = true;
    request.then(() => { if (mounted) setValue(required); });
    return () => { mounted = false; };
  }, []);
  return value;
}
