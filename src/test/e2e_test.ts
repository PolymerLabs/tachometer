/**
 * @license
 * Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {assert} from 'chai';
import * as path from 'path';
import {main} from '../cli';
import {ConfidenceInterval} from '../stats';

// Set this environment variable to change the browsers under test.
const browsers = (process.env.TACHOMETER_E2E_TEST_BROWSERS ||
                  'chrome-headless,firefox-headless')
                     .split(',')
                     .map((b) => b.trim())
                     .filter((b) => b.length > 0);

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

/**
 * Test function wrapper to suppress tachometer's stdout/stderr output. Note we
 * can't use setup and teardown for this purpose, because mocha logs each test
 * pass/fail status before teardown runs, so then we'd suppress that too.
 */
const hideOutput = (test: () => Promise<void>) => async () => {
  const realStdoutWrite = process.stdout.write;
  const realStderrWrite = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    await test();
  } finally {
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
  }
};

function ciAverage(ci: ConfidenceInterval): number {
  return (ci.high + ci.low) / 2;
}

suite('e2e', function() {
  // We're launching real browsers and running multiple samples.
  this.timeout(1000 * 60 * 2);

  for (const browser of browsers) {
    suite(browser, function() {
      test('window.tachometerResult', hideOutput(async function() {
             const avgA = 1;
             const minA = avgA - 0.1;
             const maxA = avgA + 0.1;

             const avgB = 2;
             const minB = avgB - 0.1;
             const maxB = avgB + 0.1;

             const argv = [
               `--browser=${browser}`,
               '--measure=global',
               '--sample-size=20',
               '--timeout=0',
               path.join(testData, 'random-global.html') +
                   `?min=${minA}&max=${maxA}`,
               path.join(testData, 'random-global.html') +
                   `?min=${minB}&max=${maxB}`,
             ];

             const actual = await main(argv);
             assert.isDefined(actual);
             assert.lengthOf(actual!, 2);
             const [a, b] = actual!;
             const diffAB = a.differences[1]!;
             const diffBA = b.differences[0]!;

             assert.closeTo(a.stats.mean, avgA, 0.1);
             assert.closeTo(b.stats.mean, avgB, 0.1);
             assert.closeTo(ciAverage(diffAB.absolute), avgA - avgB, 0.1);
             assert.closeTo(ciAverage(diffBA.absolute), avgB - avgA, 0.1);
             assert.closeTo(
                 ciAverage(diffAB.relative), (avgA - avgB) / avgB, 0.1);
             assert.closeTo(
                 ciAverage(diffBA.relative), (avgB - avgA) / avgA, 0.1);
           }));

      test(
          'bench.start/stop', hideOutput(async function() {
            const delayA = 20;
            const delayB = 30;

            const argv = [
              `--browser=${browser}`,
              '--measure=callback',
              '--sample-size=10',
              '--timeout=0',
              path.join(testData, 'delayed-callback.html') + `?delay=${delayA}`,
              path.join(testData, 'delayed-callback.html') + `?delay=${delayB}`,
            ];

            const actual = await main(argv);
            assert.isDefined(actual);
            assert.lengthOf(actual!, 2);
            const [a, b] = actual!;
            const diffAB = a.differences[1]!;
            const diffBA = b.differences[0]!;

            assert.closeTo(a.stats.mean, delayA, 2);
            assert.closeTo(b.stats.mean, delayB, 2);
            assert.closeTo(ciAverage(diffAB.absolute), delayA - delayB, 2);
            assert.closeTo(ciAverage(diffBA.absolute), delayB - delayA, 2);
            assert.closeTo(
                ciAverage(diffAB.relative), (delayA - delayB) / delayB, 2);
            assert.closeTo(
                ciAverage(diffBA.relative), (delayB - delayA) / delayA, 2);
          }));

      // Only Chrome supports FCP.
      if (browser.startsWith('chrome')) {
        test('fcp', hideOutput(async function() {
               const delayA = 20;
               const delayB = 30;

               const argv = [
                 `--browser=${browser}`,
                 '--measure=fcp',
                 '--sample-size=10',
                 '--timeout=0',
                 path.join(testData, 'delayed-fcp.html') + `?delay=${delayA}`,
                 path.join(testData, 'delayed-fcp.html') + `?delay=${delayB}`,
               ];

               const actual = await main(argv);
               assert.isDefined(actual);
               assert.lengthOf(actual!, 2);
               const [a, b] = actual!;
               const diffAB = a.differences[1]!;
               const diffBA = b.differences[0]!;

               // We can't be very precise with expectations here, since FCP is
               // so variable, but we can check that FCP takes at least as long
               // as our setTimeout delays, and that A paints before than B.
               assert.isAbove(a.stats.mean, delayA);
               assert.isAbove(b.stats.mean, delayB);
               assert.isBelow(ciAverage(diffAB.absolute), 0);
               assert.isAbove(ciAverage(diffBA.absolute), 0);
               assert.isBelow(ciAverage(diffAB.relative), 0);
               assert.isAbove(ciAverage(diffBA.relative), 0);
             }));
      }

      test('window size', hideOutput(async function() {
             const argv = [
               `--browser=${browser}`,
               '--measure=global',
               '--sample-size=2',
               '--timeout=0',
               '--window-size=500,200',
               path.join(testData, 'window-size.html'),
             ];
             const expected = 500 * 200;

             const actual = await main(argv);
             assert.isDefined(actual);
             assert.lengthOf(actual!, 1);
             const {stats} = actual![0];
             if (browser.endsWith('-headless')) {
               // Headless browsers don't render any window borders etc.
               assert.equal(stats.mean, expected);
             } else {
               // When launched graphically we get extra window borders and
               // other chrome, so we get a larger window than we asked for.
               assert.closeTo(stats.mean, expected, 0.25 * expected);
             }
           }));
    });
  }
});