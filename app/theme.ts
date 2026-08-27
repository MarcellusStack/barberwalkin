import { createTheme } from "@mantine/core";

export const theme = createTheme({
  colors: {
    ink: [
      "#f7f7f7",
      "#eeeeee",
      "#e2e2e2",
      "#cacaca",
      "#aaaaaa",
      "#888888",
      "#666666",
      "#444444",
      "#262626",
      "#111111",
    ],
  },
  primaryColor: "ink",
  primaryShade: 9,
  black: "#111111",
  white: "#ffffff",
  defaultRadius: 6,
  fontFamily: "var(--font-geist-sans), Arial, sans-serif",
  headings: {
    fontFamily: "var(--font-geist-sans), Arial, sans-serif",
    fontWeight: "600",
  },
  components: {
    Button: {
      defaultProps: {
        size: "md",
      },
      styles: {
        root: { fontWeight: 600 },
      },
    },
    Input: {
      defaultProps: {
        size: "md",
      },
      styles: {
        input: {
          backgroundColor: "var(--mantine-color-white)",
          borderColor: "var(--mantine-color-gray-3)",
        },
      },
    },
  },
});
