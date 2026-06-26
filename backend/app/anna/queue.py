"""In-process async job queue with bounded concurrency + retry/backoff."""
import asyncio


class _Queue:
    def __init__(self, concurrency=4, max_retries=3, base_delay=0.5, on_error=None):
        self._sem = asyncio.Semaphore(concurrency)
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.on_error = on_error
        self.stats = {"queued": 0, "running": 0, "done": 0, "failed": 0, "retries": 0}

    async def push(self, fn, name="job"):
        self.stats["queued"] += 1
        async with self._sem:
            self.stats["running"] += 1
            try:
                attempt = 0
                while True:
                    try:
                        result = await fn()
                        self.stats["done"] += 1
                        return result
                    except Exception as err:  # noqa: BLE001
                        attempt += 1
                        if self.on_error:
                            try:
                                self.on_error(err, {"name": name, "attempt": attempt})
                            except Exception:  # noqa: BLE001
                                pass
                        if attempt > self.max_retries:
                            self.stats["failed"] += 1
                            raise
                        self.stats["retries"] += 1
                        await asyncio.sleep(self.base_delay * (2 ** (attempt - 1)))
            finally:
                self.stats["running"] -= 1

    async def push_all(self, fns):
        return await asyncio.gather(*[self.push(fn, f"batch[{i}]") for i, fn in enumerate(fns)])


def create_queue(concurrency=4, max_retries=3, base_delay=0.5, on_error=None) -> _Queue:
    return _Queue(concurrency, max_retries, base_delay, on_error)
