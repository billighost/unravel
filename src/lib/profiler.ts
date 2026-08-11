export class Profiler {
  private startTimes: Map<string, number> = new Map();
  private measurements: { name: string; duration: number; desc?: string }[] = [];

  constructor() {
    this.start('total', 'Total Request Time');
  }

  start(name: string, desc?: string) {
    this.startTimes.set(name, performance.now());
  }

  stop(name: string, desc?: string) {
    const start = this.startTimes.get(name);
    if (start !== undefined) {
      const dur = performance.now() - start;
      this.measurements.push({ name, duration: dur, desc });
      return dur;
    }
    return 0;
  }

  getHeaders(): Record<string, string> {
    const timingString = this.measurements
      .map(m => {
        const descPart = m.desc ? `;desc="${m.desc}"` : '';
        return `${m.name}${descPart};dur=${m.duration.toFixed(2)}`;
      })
      .join(', ');
    return {
      'Server-Timing': timingString
    };
  }

  log(route: string) {
    // Per-request console output is meaningful cost on the edge runtime (every
    // line is serialized and shipped to the log drain) and leaks timing detail
    // in production, so it is limited to development.
    if (process.env.NODE_ENV === 'production') return;

    console.log(`[PROFILER] ${route}:`);
    for (const m of this.measurements) {
      console.log(`  - ${m.desc || m.name}: ${m.duration.toFixed(2)}ms`);
    }
  }
}
