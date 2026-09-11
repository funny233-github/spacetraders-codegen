/**
 * Advanced Example: Comprehensive Spacetraders API Usage
 *
 * This example demonstrates advanced patterns including:
 * - Multiple API calls
 * - Error handling strategies
 * - Rate limit management
 * - Response validation
 */

import { AgentTokenClient } from '../target/spacetraders-api/client';
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
  const http = new AgentTokenClient({
    token: process.env.AGENT_TOKEN,
  });

  let lastError: Error | null = null;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📍 Attempt ${attempt} of ${maxRetries}...`);

      // Call navigate - returns data directly, throws on error
      const result = await navigateShip(
        http,
        config.shipSymbol
      );

      console.log('\n✅ Navigation successful!');
      displayNavigationResult(result);
      return; // Success, exit function
    } catch (error) {
      lastError = error as Error;

      if (error instanceof ApiError) {
        console.log(`\n❌ Attempt ${attempt} failed (API):`, error.message);

        // Check for retryable errors
        if (error instanceof RateLimitError) {
          console.log(`⏱️  Rate limit exceeded. Waiting before retry...`);
          await sleep(retryDelay * attempt);
          continue;
        }

        // For other API errors, don't retry
        return;
      } else if (error instanceof Error) {
        console.log(`\n❌ Attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          break;
        }

        const waitTime = retryDelay * attempt;
        console.log(`⏳ Waiting ${waitTime}ms before next attempt...`);
        await sleep(waitTime);
      } else {
        console.log(`\n💥 Attempt ${attempt} had an unexpected error:`);
        if (attempt === maxRetries) {
          break;
        }
        await sleep(retryDelay * attempt);
      }
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
  const http = new AgentTokenClient({
    token: process.env.AGENT_TOKEN,
  });

  const shipSymbols = ['ship-1', 'ship-2', 'ship-3'];
  const results: Array<{ ship: string; success: boolean; data?: any; error?: Error }> = [];

  console.log('🚀 Starting batch navigation for 3 ships...\n');

  for (const ship of shipSymbols) {
    try {
      const result = await navigateShip(http, ship);
      results.push({ ship, success: true, data: result });
      console.log(`✅ ${ship}: Success`);
    } catch (error) {
      results.push({ ship, success: false, error: error as Error });
      if (error instanceof ApiError) {
        console.log(`❌ ${ship}: ${error.message}`);
      } else {
        console.log(`💥 ${ship}: ${(error as Error).message}`);
      }
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
      console.log('\n💥 Example failed:', err);
      process.exit(1);
    });
}

export { exampleWithRetries, exampleBatchOps, ExampleConfig };
