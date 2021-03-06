/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

// Note: sync with runner/src/types.ts
interface BenchmarkResponse {
  millis: number;
}

let startTime: number;
export function start() {
  startTime = performance.now();
}

export async function stop() {
  const end = performance.now();
  const runtime = end - startTime;
  console.log('benchmark runtime', runtime, 'ms');
  const response: BenchmarkResponse = {
    millis: runtime,
  };
  fetch('/submitResults', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  });
}
