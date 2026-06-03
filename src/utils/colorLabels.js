const HEX_LABELS = {
  '#ffffff': 'Branco',
  '#000000': 'Preto',
  '#1e293b': 'Grafite',
  '#525252': 'Cinza',
  '#e8a317': 'Amarelo dourado',
  '#f59e0b': 'Laranja',
  '#ffff00': 'Amarelo',
  '#f5c518': 'Amarelo',
  '#ff0000': 'Vermelho',
  '#e11d48': 'Vermelho',
  '#804000': 'Castanho',
};

export function formatColorsForMessage(hexList) {
  if (!hexList?.length) return null;
  const labels = hexList.map((hex) => {
    const key = String(hex).trim().toLowerCase();
    return HEX_LABELS[key] || key.toUpperCase();
  });
  return [...new Set(labels)].join(', ');
}
