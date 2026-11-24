// Lightweight performance measurement helpers
export const measurePerformance = (name: string, fn: () => void) => fn();
export const markPerformance = () => {};
export const processInChunks = async (items: any[], fn: (item: any) => any) => {
  for (const item of items) {
    await fn(item);
  }
};
