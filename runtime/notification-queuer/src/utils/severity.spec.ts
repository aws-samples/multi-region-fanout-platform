/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { mapSeverityToLevel } from './severity';

describe('mapSeverityToLevel()', () => {
  it('should map an unknown severity to default level 4', () => {
    const actual = mapSeverityToLevel('foo');
    expect(actual).toEqual(4);
  });

  it("should map 'unknown' to default level 4", () => {
    const actual = mapSeverityToLevel('Unknown');
    expect(actual).toEqual(4);
  });

  it("should map 'minor' to level 3", () => {
    const actual = mapSeverityToLevel('minor');
    expect(actual).toEqual(3);
  });

  it("should map 'MODERATE' to level 2", () => {
    const actual = mapSeverityToLevel('Moderate');
    expect(actual).toEqual(2);
  });

  it("should map 'SEVERE' to level 1", () => {
    const actual = mapSeverityToLevel('SEVERE');
    expect(actual).toEqual(1);
  });

  it("should map 'EXTREME' to level 0", () => {
    const actual = mapSeverityToLevel('Extreme');
    expect(actual).toEqual(0);
  });
});
