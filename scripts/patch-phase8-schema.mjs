import fs from 'node:fs';

const path = 'prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');

if (schema.includes('model ChaveaCard {')) {
  console.log('Phase 8 schema already patched.');
  process.exit(0);
}

schema = schema.replace(
`enum CasualMatchRoomStatus {
  OPEN
  AWAITING_CONFIRMATION
  FINISHED
  CANCELED
}
`,
`enum CasualMatchRoomStatus {
  OPEN
  AWAITING_CONFIRMATION
  FINISHED
  CANCELED
}

enum CardRarity {
  COMMON
  RARE
  EPIC
  LEGENDARY
}
`,
);

schema = schema.replace(
`  casualRoomsAsChallenger      CasualMatchRoom[]        @relation("CasualRoomChallenger")
  casualRoomsAsChallenged      CasualMatchRoom[]        @relation("CasualRoomChallenged")
}`,
`  casualRoomsAsChallenger      CasualMatchRoom[]        @relation("CasualRoomChallenger")
  casualRoomsAsChallenged      CasualMatchRoom[]        @relation("CasualRoomChallenged")
  inventoryCards               UserInventoryCard[]
  stickerPacks                 UserStickerPack[]
}`,
);

schema = schema.replace(
`model AuthAccount {`,
`model ChaveaCard {
  id          String              @id @default(uuid()) @db.Uuid
  cardNumber  Int                 @unique
  name        String
  rarity      CardRarity
  imageUrl    String?
  boostType   String              @default("NONE") @db.VarChar(32)
  boostValue  Float               @default(0)
  albumPage   String              @db.VarChar(100)
  isActive    Boolean             @default(true)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  inventory   UserInventoryCard[]

  @@index([albumPage, cardNumber])
  @@index([rarity, isActive])
}

model UserInventoryCard {
  id         String      @id @default(uuid()) @db.Uuid
  userId     String      @db.Uuid
  cardId     String      @db.Uuid
  isEquipped Boolean     @default(false)
  acquiredAt DateTime    @default(now())
  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  card       ChaveaCard  @relation(fields: [cardId], references: [id], onDelete: Restrict)

  @@index([userId, cardId])
  @@index([userId, isEquipped])
  @@index([cardId])
}

model UserStickerPack {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  packType  String   @db.VarChar(32)
  quantity  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, packType])
  @@index([userId, quantity])
}

model AuthAccount {`,
);

fs.writeFileSync(path, schema);
console.log('Phase 8 schema patched.');
