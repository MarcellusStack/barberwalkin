import { expect, test } from "@playwright/test";

test("Scaffold wird in der laufenden Anwendung angezeigt", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /To get started/ }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Next.js logo" })).toBeVisible();
});
