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

require('source-map-support').install();
require('chromedriver');

import * as fs from 'fs-extra';
import * as path from 'path';

import {Builder} from 'selenium-webdriver';
import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');

import {BenchmarkSpec, RunData} from './types';
import {Server} from './server';
import {getRunData} from './system';

const repoRoot = path.resolve(__dirname, '..', '..');

const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show this documentation',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'port',
    description: 'Which port to run on',
    type: Number,
    defaultValue: '0',
  },
  {
    name: 'benchmark',
    description: 'Which benchmarks to run',
    alias: 'b',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'implementation',
    description: 'Which implementations to run',
    alias: 'i',
    type: String,
    defaultValue: 'lit-html',
  },
];

interface Opts {
  help: boolean;
  port: number;
  benchmark: string;
  implementation: string;
}

const ignoreFiles = new Set([
  'node_modules',
  'package.json',
  'package-lock.json',
  // TODO(aomarks) Remove after old files removed.
  'old',
]);

async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const specs = [];
  let impls;
  if (opts.implementation === '*') {
    impls = await fs.readdir(path.join(repoRoot, 'benchmarks'));
    impls = impls.filter((dir) => !ignoreFiles.has(dir));
  } else {
    impls = opts.implementation.split(',');
  }
  for (const implementation of impls) {
    const dir = path.join(repoRoot, 'benchmarks', implementation);
    let benchmarks;
    if (opts.benchmark === '*') {
      benchmarks = await fs.readdir(dir);
      benchmarks = benchmarks.filter((dir) => !ignoreFiles.has(dir));
    } else {
      benchmarks = opts.benchmark.split(',');
    }
    for (const benchmark of benchmarks) {
      specs.push({
        benchmark,
        implementation,
        urlPath: `/benchmarks/${implementation}/${benchmark}/index.html`,
      });
    }
  }
  return specs;
}

async function saveRun(benchmarkName: string, newData: RunData) {
  const filename = path.resolve(
      __dirname, '..', '..', 'benchmarks', benchmarkName, 'runs.json');
  let data: {runs: RunData[]}|undefined;
  let contents: string|undefined;
  try {
    contents = await fs.readFile(filename, 'utf-8');
  } catch (e) {
  }
  if (contents !== undefined && contents.trim() !== '') {
    data = JSON.parse(contents);
  }
  if (data === undefined) {
    data = {runs: []};
  }
  if (data.runs === undefined) {
    data.runs = [];
  }
  data.runs.push(newData);
  fs.writeFile(filename, JSON.stringify(data));
}

async function main() {
  const opts = commandLineArgs(optDefs) as Opts;
  if (opts.help) {
    console.log(commandLineUsage([{
      header: 'lit-benchmarks-runner',
      optionList: optDefs,
    }]));
    return;
  }
  const specs = await specsFromOpts(opts);
  const server = new Server(repoRoot, opts.port);
  const driver = await new Builder().forBrowser('chrome').build();
  for (const spec of specs) {
    console.log(
        `Running benchmark ${spec.benchmark} in ${spec.implementation}`);
    const run = server.runBenchmark(spec);
    console.log(`Opening ${run.url}`);
    await driver.get(run.url);
    const results = await run.results;
    const fullName = `${spec.implementation}-${spec.benchmark}`;
    const runData = await getRunData(fullName, results);
    console.log(JSON.stringify(runData, null, 2));
    await saveRun(fullName, runData);
  }
  await Promise.all([
    driver.close(),
    server.close(),
  ]);
}

main();