import { loadAllPackages } from "@/content/loader";
import { validatePackage } from "@/content/validator";

/** CLI entry point for §32. Exits non-zero so it can gate CI. */
async function main(): Promise<void> {
  const packages = await loadAllPackages();
  let total = 0;

  for (const pkg of packages.values()) {
    const issues = validatePackage(pkg);
    total += issues.length;
    const counts = [
      `${pkg.worlds.size} world(s)`,
      `${pkg.characters.size} character(s)`,
      `${pkg.relationships.size} relationship(s)`,
      `${pkg.scenarios.size} scenario(s)`,
      `${pkg.stories.size} story/stories`,
      `${pkg.evaluators.size} evaluator(s)`,
      `${pkg.memories.length} seed memory/memories`,
    ].join(", ");
    console.log(`${issues.length === 0 ? "OK  " : "FAIL"} ${pkg.manifest.id}: ${counts}`);
    for (const issue of issues) console.log(`     ${issue.path}: ${issue.message}`);
  }

  if (packages.size === 0) {
    console.log("no content packages found");
  }
  if (total > 0) {
    console.error(`\n${total} content issue(s)`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
