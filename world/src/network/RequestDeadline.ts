/** Bound a request; streamed downloads can renew the deadline when bytes arrive. */
export async function requestWithDeadline<T>(
  request: (signal: AbortSignal, keepAlive: () => void) => Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let keepAlive = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    keepAlive = () => {
      if (finished) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out.`));
        controller.abort();
      }, milliseconds);
    };
    keepAlive();
  });
  try {
    return await Promise.race([request(controller.signal, keepAlive), deadline]);
  } finally {
    finished = true;
    clearTimeout(timer);
  }
}
