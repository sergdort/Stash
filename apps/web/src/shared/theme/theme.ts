import { createTheme } from "@mui/material/styles"

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0F766E",
      light: "#14B8A6",
      dark: "#115E59",
    },
    secondary: {
      main: "#334155",
      light: "#475569",
      dark: "#1E293B",
    },
    success: {
      main: "#059669",
    },
    warning: {
      main: "#F97316",
    },
    background: {
      default: "#F4F8F8",
      paper: "#ffffff",
    },
    text: {
      primary: "#0F172A",
      secondary: "#334155",
    },
    divider: "rgba(15, 23, 42, 0.12)",
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    h3: {
      fontFamily: '"Newsreader", Georgia, serif',
      fontWeight: 700,
      lineHeight: 1.12,
      letterSpacing: "-0.01em",
    },
    h4: {
      fontFamily: '"Newsreader", Georgia, serif',
      fontWeight: 700,
      lineHeight: 1.12,
      letterSpacing: "-0.01em",
    },
    h6: {
      fontFamily: '"Newsreader", Georgia, serif',
      fontWeight: 600,
      lineHeight: 1.22,
      letterSpacing: "-0.01em",
    },
    subtitle1: {
      fontWeight: 500,
    },
    body1: {
      lineHeight: 1.65,
    },
    body2: {
      lineHeight: 1.58,
    },
    button: {
      fontWeight: 600,
      textTransform: "none",
      letterSpacing: "0.01em",
    },
  },
  components: {
    MuiPaper: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        root: {
          borderColor: "rgba(15, 23, 42, 0.12)",
          borderRadius: 20,
          boxShadow: "0 8px 30px rgba(15, 23, 42, 0.06)",
          backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0.98))",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 12,
          paddingInline: "1rem",
          transition: "transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease",
          "&:hover": {
            transform: "translateY(-1px)",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(15, 23, 42, 0.18)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(15, 118, 110, 0.48)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "#0F766E",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          textDecorationColor: "rgba(15, 118, 110, 0.35)",
          textUnderlineOffset: 3,
          "&:hover": {
            color: "#0F766E",
            textDecorationColor: "#0F766E",
          },
        },
      },
    },
  },
})
