import { test, expect } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test("dialogs contain keyboard focus and restore their opener", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Add data", exact: true });
  await expect(opener).toBeVisible({ timeout: 30_000 });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Add data" });
  await expect(dialog).toBeVisible();
  // Exercise both directions across the whole dialog rather than depending on its layout.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("menus and command palette support keyboard navigation", async ({ page }) => {
  await page.goto("/");
  const more = page.getByRole("button", { name: "More", exact: true });
  await expect(more).toBeVisible({ timeout: 30_000 });
  await more.click();
  const items = page.getByRole("menu", { name: "More" }).getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await page.keyboard.press(`${MOD}+p`);
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("go to home");
  const option = page.getByRole("option", { name: /Go to Home/i });
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", await option.getAttribute("id") ?? "");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /What do you want to know/, level: 1 })).toBeVisible();
});

test("editor and result columns resize with the keyboard", async ({ page }) => {
  await page.goto("/");
  const split = page.getByRole("separator", { name: "Resize editor", exact: true });
  await expect(split).toBeVisible({ timeout: 30_000 });
  await split.focus();
  await page.keyboard.press("ArrowDown");
  await expect(split).toHaveAttribute("aria-valuenow", "50");
  await page.keyboard.press("Home");
  await expect(split).toHaveAttribute("aria-valuenow", "15");
  await page.getByRole("button", { name: /^Run/ }).click();
  const column = page.getByRole("separator", { name: "Resize dept_name column" });
  await expect(column).toBeVisible({ timeout: 15_000 });
  const before = Number(await column.getAttribute("aria-valuenow"));
  await column.focus();
  await page.keyboard.press("ArrowRight");
  await expect(column).toHaveAttribute("aria-valuenow", String(before + 16));
});
