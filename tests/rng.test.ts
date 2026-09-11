import { describe, expect, it } from 'vitest';
import { mulberry32, noise2, fbm2, hash2, randInt, pick } from '../src/core/rng';

describe('mulberry32', () => {
  it('同种子产生相同序列', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('不同种子产生不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let diff = false;
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) diff = true;
    }
    expect(diff).toBe(true);
  });
  it('输出在 [0,1) 范围内', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('噪声', () => {
  it('noise2 / fbm2 输出在 [0,1] 且确定', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.53;
      const n = noise2(x, y, 123);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(n).toBe(noise2(x, y, 123));
      const f = fbm2(x, y, 123);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it('hash2 确定', () => {
    expect(hash2(3, 5, 99)).toBe(hash2(3, 5, 99));
  });
});

describe('辅助函数', () => {
  it('randInt 在闭区间内', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const v = randInt(2, 5, r);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it('pick 返回数组元素', () => {
    const r = mulberry32(4);
    const arr = [1, 2, 3] as const;
    for (let i = 0; i < 20; i++) expect(arr).toContain(pick(arr, r));
  });
});
