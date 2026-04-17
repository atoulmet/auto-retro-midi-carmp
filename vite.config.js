import { resolve } from "path";

export default {
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        kml: resolve(__dirname, "kml/index.html"),
      },
    },
  },
};
