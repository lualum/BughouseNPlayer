import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import pluginUnicorn from "eslint-plugin-unicorn";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
   {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
         parser: parser,
         parserOptions: {
            project: `${__dirname}/tsconfig.eslint.json`,
            tsconfigRootDir: __dirname,
         },
      },
      plugins: {
         "@typescript-eslint": tseslint,
         unicorn: pluginUnicorn,
      },
      rules: {
         ...tseslint.configs.recommended.rules,
         ...pluginUnicorn.configs.recommended.rules,
         "object-shorthand": ["error", "always"],
      },
   },
   prettierConfig,
];
