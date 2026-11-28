const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

module.exports = async function reviewImage(info, name, locator) {
  if (info.project.name !== 'mobile-chromium') return;
  const image = await locator.screenshot({ animations: 'disabled' });
  await info.attach(name, { body: image, contentType: 'image/png' });
  if (process.env.MILE_RC_SCREENSHOTS) {
    await mkdir(process.env.MILE_RC_SCREENSHOTS, { recursive: true });
    await writeFile(path.join(process.env.MILE_RC_SCREENSHOTS, name + '.png'), image);
  }
};
