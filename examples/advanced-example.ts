/**
 * Advanced Example: Comprehensive Spacetraders API Usage
 *
 * This example demonstrates advanced patterns including:
 * - Multiple API calls
 * - Error handling strategies
 * - Rate limit management
 * - Response validation
 */

import { HttpClient } from '../target/spacetraders-api/client';
import { navigateShip } from '../target/spacetraders-api/fleet/navigateship';
import { ApiError, RateLimitError } from '../target/spacetraders-api/errors';

/**
 * Configuration for our example
 */
interface ExampleConfig {
  shipSymbol: string;
  systemSymbol: string;
  waypointSymbol?: string;
}

/**
 * Example with advanced error handling and retry logic
 */
async function exampleWithRetries(config: ExampleConfig): Promise<void> {
  const http = new HttpClient({
    token: process.env.AGENT_TOKEN,
  });

  let lastError: Error | null = null;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📍 Attempt ${attempt} of ${maxRetries}...`);

      // Call navigate with proper parameters
      const result = await navigateShip(
        http,
        config.shipSymbol
      );

      if (result.ok) {
        console.log('\n✅ Navigation successful!');
        displayNavigationResult(result.data);
        return; // Success, exit function
      } else {
        // Check for retryable errors
        if (result.error instanceof RateLimitError) {
          console.log(`⏱️  Rate limit exceeded. Waiting before retry...`);
          await sleep(retryDelay * attempt);
          continue;
        }

        // For other errors, don't retry
        throw new Error(`API error: ${result.error.message}`);
      }
    } catch (error) {
      lastError = error as Error;
      console.log(`\n❌ Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      const waitTime = retryDelay * attempt;
      console.log(`⏳ Waiting ${waitTime}ms before next attempt...`);
      await sleep(waitTime);
    }
  }

  console.log('\n💥 All retries exhausted!');
  if (lastError) {
    console.log('Final error:', lastError.message);
  }
  process.exit(1);
}

/**
 * Display navigation result in a formatted way
 */
function displayNavigationResult(data: any): void {
  console.log('\n=== Navigation Data ===');
  console.log('Nav:', JSON.stringify(data.nav, null, 2));
  console.log('Fuel:', JSON.stringify(data.fuel, null, 2));
  console.log('Events:', data.events?.length || 0, 'events');
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Example: Batch operations with multiple ships
 */
async function exampleBatchOps(): Promise<void> {
  const http = new HttpClient({
    token: process.env.AGENT_TOKEN,
  });

  const shipSymbols = ['ship-1', 'ship-2', 'ship-3'];
  const results: Array<{ ship: string; success: boolean; data?: any }> = [];

  console.log('🚀 Starting batch navigation for 3 ships...\n');

  for (const ship of shipSymbols) {
    try {
      const result = await navigateShip(http, ship);
      if (result.ok) {
        results.push({ ship, success: true, data: result.data });
        console.log(`✅ ${ship}: Success`);
      } else {
        results.push({ ship, success: false, error: result.error });
        console.log(`❌ ${ship}: ${result.error.message}`);
      }
    } catch (error) {
      results.push({ ship, success: false, error: error as Error });
      console.log(`💥 ${ship}: ${error.message}`);
    }
  }

  console.log('\n=== Batch Results ===');
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`Success: ${successCount}/${results.length}`);
  console.log(`Failed: ${failCount}/${results.length}`);
}

// Run examples if this file is executed directly
if (require.main === module) {
  const config: ExampleConfig = {
    shipSymbol: process.env.SHIP_SYMBOL || 'ship-123',
    systemSymbol: process.env.SYSTEM_SYMBOL || 'star-hadex',
  };

  console.log('=== Advanced Spacetraders API Examples ===\n');
  console.log('This example requires:');
  console.log('  AGENT_TOKEN - Your SpaceTraders API token');
  console.log('  SHIP_SYMBOL - Your ship symbol (optional, default: ship-123)');
  console.log('\nSet variables and run:');
  console.log('  export AGENT_TOKEN="your-token"');
  console.log('  export SHIP_SYMBOL="your-ship"');
  console.log('  npm run example:advanced\n');

  if (!process.env.AGENT_TOKEN) {
    console.log('Missing AGENT_TOKEN. Exiting...');
    process.exit(1);
  }

  // Run the retry example
  exampleWithRetries(config)
    .then(() => {
      console.log('\n✅ Advanced example completed!');
    })
    .catch((err) => {
      console.error('\n💥 Example failed:', err);
      process.exit(1);
    });
}

export { exampleWithRetries, exampleBatchOps, ExampleConfig };
