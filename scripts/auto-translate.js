// scripts/auto-translate.js
import fs from "fs";
import { Translate } from "@google-cloud/translate";

const translate = new Translate();
(async () => {
  const en = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));
  const th = {};
  for (const key of Object.keys(en)) {
    const [tText] = await translate.translate(en[key], "th");
    th[key] = tText;
  }
  fs.writeFileSync("src/locales/th.json", JSON.stringify(th, null, 2));
})();
