/**
 * CMS Schema Fidelity & Data Preservation Test Suite
 * Validates backward compatibility, 18 Extraescolares activities, news posts,
 * null preservation, and collision-free route configuration.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${description}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  console.log('=== Executing CMS Schema Fidelity & Content Integrity Tests ===\n');

  const rootDir = path.resolve(__dirname, '..');
  const extraescolaresPath = path.join(rootDir, 'src', '_data', 'extraescolares.json');
  const configYmlPath = path.join(rootDir, 'admin', 'config.yml');
  const postsDir = path.join(rootDir, 'src', 'posts');
  const pagesDir = path.join(rootDir, 'src', 'pages');

  // Test 1: Extraescolares JSON Structure & 18 Activities
  test('Extraescolares JSON exists and has valid top-level fields', () => {
    assert(fs.existsSync(extraescolaresPath), 'extraescolares.json does not exist');
    const data = JSON.parse(fs.readFileSync(extraescolaresPath, 'utf8'));

    assert.strictEqual(data.academic_year, '2026-2027', 'Academic year mismatch');
    assert.strictEqual(typeof data.schedule_image, 'string', 'Missing schedule_image');
    assert(Array.isArray(data.activities), 'activities is not an array');
    assert.strictEqual(data.activities.length, 18, `Expected exactly 18 activities, found ${data.activities.length}`);
    assert(Array.isArray(data.pricing_table), 'pricing_table is not an array');
    assert.strictEqual(data.pricing_table.length, 18, `Expected exactly 18 pricing items, found ${data.pricing_table.length}`);
    assert(Array.isArray(data.general_conditions), 'general_conditions is not an array');
    assert.strictEqual(data.general_conditions.length, 14, `Expected 14 conditions, found ${data.general_conditions.length}`);
    assert(typeof data.coexistence_articles === 'object', 'Missing coexistence_articles');
  });

  // Test 2: Activities Preservation & Types/Nulls
  test('All 18 Extraescolares activities preserve required types, nulls, and statuses', () => {
    const data = JSON.parse(fs.readFileSync(extraescolaresPath, 'utf8'));
    const expectedActivities = [
      'baile-moderno', 'multideporte', 'ioga', 'baloncesto', 'arte',
      'multiaventura', 'teatro-musical', 'musica-movemento', 'tecnoloxias-innovadoras',
      'judo', 'ximnasia-ritmica', 'ingles', 'taekwondo', 'parkour',
      'hockey', 'minichef', 'scape-room', 'mentes-curiosas'
    ];

    assert.strictEqual(data.activities.length, 18);
    const foundIds = data.activities.map(a => a.id);
    assert.deepStrictEqual(foundIds, expectedActivities, 'Activity IDs do not match expected list');

    // Verify null preservation in specific activities (e.g. Arte has provider: null, registration_url: null)
    const arte = data.activities.find(a => a.id === 'arte');
    assert.strictEqual(arte.status, 'full');
    assert.strictEqual(arte.provider, null, 'Arte provider should be null');
    assert.strictEqual(arte.registration_url, null, 'Arte registration_url should be null');

    // Verify full data for Ingles (PDF type and email)
    const ingles = data.activities.find(a => a.id === 'ingles');
    assert.strictEqual(ingles.registration_type, 'pdf');
    assert.strictEqual(ingles.contact_email, 'portobellow11@yahoo.es');

    // Verify each activity has id, name, stage, price, status
    for (const act of data.activities) {
      assert(typeof act.id === 'string' && act.id.length > 0, `Invalid id in activity ${JSON.stringify(act)}`);
      assert(typeof act.name === 'string' && act.name.length > 0, `Invalid name in activity ${act.id}`);
      assert(typeof act.stage === 'string', `Invalid stage in activity ${act.id}`);
      assert(typeof act.price === 'string', `Invalid price in activity ${act.id}`);
      assert(['available', 'full', 'partial'].includes(act.status), `Invalid status ${act.status} in activity ${act.id}`);
    }
  });

  // Test 3: config.yml Schema Coverage
  test('admin/config.yml contains full schema mapping for extraescolares and posts', () => {
    assert(fs.existsSync(configYmlPath), 'admin/config.yml does not exist');
    const configContent = fs.readFileSync(configYmlPath, 'utf8');

    assert(configContent.includes('backend:'), 'Missing backend config');
    assert(configContent.includes('publish_mode: editorial_workflow'), 'editorial_workflow publish_mode not configured');
    assert(configContent.includes('name: "extraescolares"'), 'Missing extraescolares collection');
    assert(configContent.includes('name: "pricing_table"'), 'Missing pricing_table field in extraescolares');
    assert(configContent.includes('name: "general_conditions"'), 'Missing general_conditions in extraescolares');
    assert(configContent.includes('name: "coexistence_articles"'), 'Missing coexistence_articles in extraescolares');
    assert(configContent.includes('name: "posts"'), 'Missing posts collection');
  });

  // Test 4: Static Route Collision Prevention
  test('Static page route definitions are collision-safe and do not conflict with templates', () => {
    const configContent = fs.readFileSync(configYmlPath, 'utf8');

    // Ensure pages is configured safely as explicit files or restricted without arbitrary creation
    assert(
      configContent.includes('src/pages/comedor.md') &&
      configContent.includes('src/pages/madrugadores.md') &&
      configContent.includes('src/pages/consello-escolar.md'),
      'Pages collection should explicitly bind known markdown files'
    );

    // Verify protected core routes are not in markdown pages
    const pageFiles = fs.readdirSync(pagesDir);
    assert(pageFiles.includes('extraescolares.njk'), 'extraescolares.njk should exist as Nunjucks template');
    assert(pageFiles.includes('novas.njk'), 'novas.njk should exist as Nunjucks template');
    assert(!pageFiles.includes('novas.md'), 'novas.md should NOT exist (prevents route collision)');
    assert(!pageFiles.includes('extraescolares.md'), 'extraescolares.md should NOT exist (prevents route collision)');
  });

  // Test 5: News Posts Frontmatter Integrity
  test('All Markdown news articles in src/posts have valid metadata and layouts', () => {
    const postFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
    assert(postFiles.length >= 10, `Expected at least 10 posts, found ${postFiles.length}`);

    for (const file of postFiles) {
      const content = fs.readFileSync(path.join(postsDir, file), 'utf8');
      assert(content.startsWith('---'), `Post ${file} missing frontmatter delimiter`);
      const secondDelimiter = content.indexOf('---', 3);
      assert(secondDelimiter > 0, `Post ${file} unclosed frontmatter`);

      const frontmatter = content.substring(3, secondDelimiter);
      assert(frontmatter.includes('title:'), `Post ${file} missing title`);
      assert(frontmatter.includes('date:'), `Post ${file} missing date`);
      assert(frontmatter.includes('category:'), `Post ${file} missing category`);
    }
  });

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
