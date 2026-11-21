const r = (name: string) => ({ name, sanskritName: name, lord: '', element: '', nature: '', represents: '', traits: '' });
export const getRashiByName = (n: string) => r(n);
export const getRashiBySanskritName = (n: string) => r(n);
