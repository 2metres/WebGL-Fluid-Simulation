export const drawHalftoneWave = (canvas: HTMLCanvasElement, time: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gridSize = 20;
  const rows = Math.ceil(canvas.height / gridSize);
  const cols = Math.ceil(canvas.width / gridSize);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const centerX = x * gridSize;
      const centerY = y * gridSize;
      const distanceFromCenter = Math.sqrt(
        Math.pow(centerX - canvas.width / 2, 2) +
          Math.pow(centerY - canvas.height / 2, 2)
      );
      const maxDistance = Math.sqrt(
        Math.pow(canvas.width / 2, 2) + Math.pow(canvas.height / 2, 2)
      );
      const normalizedDistance = distanceFromCenter / maxDistance;

      const waveOffset = Math.sin(normalizedDistance * 10 - time) * 0.5 + 0.5;
      const size = gridSize * waveOffset * 0.8;

      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${waveOffset * 0.5})`;
      ctx.fill();
    }
  }
};
