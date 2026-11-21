const g = (name: string) => ({ name, sanskritName: name, represents: '', karakatva: '', traits: '' });
export const getGrahaByName = (n: string) => g(n);
export const getGrahaBySanskritName = (n: string) => g(n);
