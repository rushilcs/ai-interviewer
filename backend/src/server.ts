import { env } from "./config/env";
import { createApp } from "./app";
import { assertDatabaseConnection } from "./db/pool";

async function bootstrap() {
  await assertDatabaseConnection();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Backend listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
