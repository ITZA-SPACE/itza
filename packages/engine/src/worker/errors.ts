/** Failure of a request: bad input, bad bundle, or an engine result that breaks its own contract. */
export class ReplayRequestError extends Error {
  constructor(message: string, name = "ReplayRequestError") {
    super(message);
    this.name = name;
  }
}
