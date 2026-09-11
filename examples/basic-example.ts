/**
 * Basic Example: Using the Spacetraders API
 *
 * This example demonstrates how to use the generated API functions to
 * interact with the SpaceTraders v2 API.
 */

import { HttpClient } from '../target/spacetraders-api/client';
import { navigateShip } from '../target/spacetraders-api/fleet/navigateship';
import { ApiError } from '../target/spacetraders-api/errors';

/**
 * Example: Navigate a ship to a new location
 */
async function exampleNavigateShip(): Promise<void> {
  // Initialize the HTTP client with your SpaceTraders token
  const http = new HttpClient({
    token: process.env.AGENT_TOKEN,
  });

  try {
    // Call the generated navigate function
    // Returns data directly, throws ApiError on failure
    const result = await navigateShip(
      http,
      'ship-123'  // Replace with your actual ship symbol
    );

    console.log('✅ Navigation successful!');
    console.log('Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ApiError) {
      console.log('❌ API Error:');
      console.log('Status:', error.status);
      console.log('Message:', error.message);
    } else {
      console.error('💥 Unexpected error:', error);
    }
  }
}

/**
 * Example: Get ship details (placeholder for future generated function)
 */
async function exampleGetShipDetails(): Promise<void> {
  const http = new HttpClient({
    token: process.env.AGENT_TOKEN,
  });

  try {
    // This would use a generated getShipDetails function
    console.log('Example: Get ship details (coming soon)');
  } catch (error) {
    console.log('Error:', error);
  }
}

// Run the example
if (require.main === module) {
  console.log('=== Spacetraders API Example ===\n');
  console.log('This example requires an AGENT_TOKEN environment variable.\n');

  if (!process.env.AGENT_TENOTOKEN) {
    console.log('Set your token and run again:');
    console.log('  export AGENT_TOKEN="your-token-here"');
    console.log('  npm run example');
    process.exit(1);
  }

  exampleNavigateShip()
    .then(() => {
      console.log('\n✅ Example completed successfully!');
    })
    .catch((err) => {
      console.log('\n💥 Example failed:', err);
      process.exit(1);
    });
}

export { exampleNavigateShip, exampleGetShipDetails };
