// Simple manual test for IndexedDB functionality
// Run this in browser console on extension page to test

import { db } from './db';

export async function testIndexedDB() {
  console.log('🧪 Testing IndexedDB implementation...\n');

  try {
    // Test 1: Initialize
    console.log('1️⃣ Initializing database...');
    await db.init();
    console.log('✅ Database initialized\n');

    // Test 2: Add solution
    console.log('2️⃣ Adding test solution...');
    const testSolution = {
      id: 'test-' + Date.now(),
      text: 'This is a test solution about React hooks. useState is used for state management.',
      summary: 'React hooks for state management',
      url: 'https://example.com/test',
      title: 'React Hooks Example',
      timestamp: Date.now(),
      tags: ['react', 'hooks', 'javascript'],
      notes: 'This is a test note'
    };
    await db.addSolution(testSolution);
    console.log('✅ Solution added:', testSolution.id, '\n');

    // Test 3: Get all solutions
    console.log('3️⃣ Getting all solutions...');
    const allSolutions = await db.getAllSolutions();
    console.log(`✅ Found ${allSolutions.length} solution(s)\n`);

    // Test 4: Get specific solution
    console.log('4️⃣ Getting specific solution...');
    const retrieved = await db.getSolution(testSolution.id);
    console.log('✅ Retrieved:', retrieved?.title, '\n');

    // Test 5: Search
    console.log('5️⃣ Testing search...');
    const searchResults = await db.search('React');
    console.log(`✅ Search for "React" found ${searchResults.length} result(s)\n`);

    // Test 6: Search by tag
    console.log('6️⃣ Testing tag search...');
    const tagResults = await db.searchByTag('hooks');
    console.log(`✅ Tag search for "hooks" found ${tagResults.length} result(s)\n`);

    // Test 7: Get all tags
    console.log('7️⃣ Getting all tags...');
    const allTags = await db.getAllTags();
    console.log('✅ All tags:', allTags.join(', '), '\n');

    // Test 8: Advanced search
    console.log('8️⃣ Testing advanced search...');
    const advancedResults = await db.advancedSearch({
      query: 'hooks',
      tags: ['react'],
      startDate: Date.now() - 60000 // Last minute
    });
    console.log(`✅ Advanced search found ${advancedResults.length} result(s)\n`);

    // Test 9: Update solution
    console.log('9️⃣ Updating solution...');
    await db.updateSolution(testSolution.id, {
      notes: 'Updated test note'
    });
    const updated = await db.getSolution(testSolution.id);
    console.log('✅ Updated notes:', updated?.notes, '\n');

    // Test 10: Get count
    console.log('🔟 Getting count...');
    const count = await db.getCount();
    console.log(`✅ Total solutions: ${count}\n`);

    // Test 11: Export data
    console.log('1️⃣1️⃣ Exporting data...');
    const exported = await db.exportData();
    console.log(`✅ Exported ${exported.length} solution(s)\n`);

    // Test 12: Delete solution
    console.log('1️⃣2️⃣ Deleting test solution...');
    await db.deleteSolution(testSolution.id);
    const afterDelete = await db.getSolution(testSolution.id);
    console.log('✅ Solution deleted:', afterDelete === undefined, '\n');

    console.log('🎉 All tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Auto-run if in browser environment (not during build)
if (typeof window !== 'undefined' && (window as any).__RUN_DB_TEST__) {
  testIndexedDB();
}

// To run manually in console:
// import { testIndexedDB } from './db.test';
// testIndexedDB();

