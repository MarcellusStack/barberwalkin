import { expect, test, type Locator } from "@playwright/test";

async function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      return channels
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const styles = getComputedStyle(element);
    const foreground = luminance(styles.color);
    const background = luminance(styles.backgroundColor);

    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test("deutsche Anwendungshülle wird mit Metadaten und Geist geladen", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page).toHaveTitle("BarberWalkin – Walk-ins einfach organisieren");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "BarberWalkin organisiert Warteschlange und Stühle für Walk-in-Barbershops in Echtzeit.",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "BarberWalkin" }),
  ).toBeVisible();
  await expect(page.getByText("Walk-ins einfach organisieren.")).toBeVisible();

  const fontFamily = await page.locator("body").evaluate(
    (body) => getComputedStyle(body).fontFamily,
  );
  expect(fontFamily).toContain("Geist");
});

test("zeigt Ladezustand und behandelt einen erzwungenen Routenfehler", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fehler", { waitUntil: "commit" });

  await expect(page.getByRole("status", { name: "Inhalt wird geladen" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Etwas ist schiefgelaufen",
    }),
  ).toBeVisible();
  const retryButton = page.getByRole("button", { name: "Erneut versuchen" });
  await expect(retryButton).toBeVisible();
  expect(await contrastRatio(retryButton)).toBeGreaterThanOrEqual(4.5);

  await retryButton.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(retryButton).toBeFocused();
  expect(
    await retryButton.evaluate((button) => getComputedStyle(button).outlineStyle),
  ).not.toBe("none");
  expect(
    await retryButton.evaluate((button) =>
      Number.parseFloat(getComputedStyle(button).animationDuration),
    ),
  ).toBeLessThan(0.001);

  await retryButton.press("Enter");
  await expect(page.getByRole("status", { name: "Inhalt wird geladen" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Etwas ist schiefgelaufen" }),
  ).toBeVisible();
});
