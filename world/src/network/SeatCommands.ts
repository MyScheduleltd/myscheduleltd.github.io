/** Claim/get-up/claim must reach the service in that order, even on slow radios. */
export class SeatCommands {
  private tail: Promise<void> = Promise.resolve();
  run<T>(command: () => Promise<T>): Promise<T> {
    const result = this.tail.then(command, command);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
