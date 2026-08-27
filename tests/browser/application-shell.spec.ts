import { expect, test } from "@playwright/test";

test("deutsche Anwendungshülle wird mit Metadaten, Geist und Mantine geladen", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "light",
  );
  await expect(page).toHaveTitle("BarberWalkin – Walk-ins einfach organisieren");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "BarberWalkin organisiert Warteschlange und Stühle für Walk-in-Barbershops in Echtzeit.",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "BarberWalkin" }),
  ).toBeVisible();
  await expect(page.getByText("Walk-ins einfach organisieren.")).toBeVisible();

  const fontFamily = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).fontFamily);
  expect(fontFamily).toContain("Geist");
});
