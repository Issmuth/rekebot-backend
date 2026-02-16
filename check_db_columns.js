
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkColumns() {
  try {
    // Check User table
    const resultUser = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'nameAm';
    `;
    console.log('User table check:', resultUser);

    // Check MenuItem table
    const resultMenuItem = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'MenuItem' AND column_name = 'nameAm';
    `;
    console.log('MenuItem table check:', resultMenuItem);
    
    // Check Ingredient table
    const resultIngredient = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Ingredient' AND column_name = 'nameAm';
    `;
    console.log('Ingredient table check:', resultIngredient);

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkColumns();
