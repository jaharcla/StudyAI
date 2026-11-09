import { expect, test } from "@playwright/test";

test("MathLive fractions, roots, exponents, malformed input, and keyboard text pass the existing parser", async ({ page }) => {
  await page.goto("/tests/e2e/mathlive-smoke.html");
  const field = page.locator('math-field[aria-label="Math notation smoke test"]');
  const setAndRead = async (latex: string) => {
    await field.evaluate((element, value) => { (element as HTMLElement & { value: string }).value = value as string; }, latex);
    return page.evaluate(() => (window as unknown as { readMathState: () => Promise<{ ascii: string; expression?: string; expressionAst?: object; error?: string }> }).readMathState());
  };
  const fraction = await setAndRead("\\frac{1}{2}");
  expect(fraction).toMatchObject({ expression: expect.any(String), expressionAst: expect.any(Object) });
  const root = await setAndRead("\\sqrt{x}");
  expect(root).toMatchObject({ expression: expect.stringContaining("sqrt"), expressionAst: expect.any(Object) });
  const exponent = await setAndRead("x^{2}+a");
  expect(exponent).toMatchObject({ expression: expect.stringContaining("^"), expressionAst: expect.any(Object) });
  const malformed = await setAndRead("\\frac{1}{");
  expect(malformed.error).toBeTruthy();
  await field.focus(); await field.press("Control+A"); await field.pressSequentially("x^2+a");
  const keyboard = await page.evaluate(() => (window as unknown as { readMathState: () => Promise<{ expression?: string; error?: string }> }).readMathState());
  expect(keyboard.expression).toContain("x");
  expect(keyboard.error).toBeUndefined();
});
