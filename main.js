require("dotenv").config();

// log all env variables

console.log("NOTION_TOKEN", process.env.NOTION_TOKEN);
console.log("FIXED_EXPENSES_DB_ID", process.env.FIXED_EXPENSES_DB_ID);
console.log("FIXED_INCOMES_DB_ID", process.env.FIXED_INCOMES_DB_ID);
console.log("MOVEMENTS_DB_ID", process.env.MOVEMENTS_DB_ID);
console.log("MONTHS_DB_ID", process.env.MONTHS_DB_ID);
console.log("ACCOUNTS_DB_ID", process.env.ACCOUNTS_DB_ID);

const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const dayjs = require("dayjs");

const FIXED_EXPENSES_DB_ID = process.env.FIXED_EXPENSES_DB_ID;
const FIXED_INCOMES_DB_ID = process.env.FIXED_INCOMES_DB_ID;
const MOVEMENTS_DB_ID = process.env.MOVEMENTS_DB_ID;
const MONTHS_DB_ID = process.env.MONTHS_DB_ID;

const months = {
  January: "Enero",
  February: "Febrero",
  March: "Marzo",
  April: "Abril",
  May: "Mayo",
  June: "Junio",
  July: "Julio",
  August: "Agosto",
  September: "Septiembre",
  October: "Octubre",
  November: "Noviembre",
  December: "Diciembre",
};

const getFixedTxs = async (databaseId, now) => {
  return notion.databases.query({
    database_id: databaseId,
    filter: {
      or: [
        { property: "Recurrente", checkbox: { equals: true } },
        {
          property: "Fecha fin",
          date: { on_or_after: now.format("YYYY-MM-DD") },
        },
      ],
    },
  });
};

const getMonthOrCreate = async (month) => {
  const response = await notion.databases.query({
    database_id: MONTHS_DB_ID,
    filter: {
      property: "Nombre",
      title: { equals: month },
    },
  });

  if (response.results.length === 0) {
    const newMonth = await notion.pages.create({
      parent: { database_id: MONTHS_DB_ID },
      properties: { Nombre: { title: [{ text: { content: month } }] } },
    });
    return newMonth.id;
  } else {
    return response.results[0].id;
  }
};

const existsMovement = async (name, date) => {
  const response = await notion.databases.query({
    database_id: MOVEMENTS_DB_ID,
    filter: {
      and: [
        {
          property: "Concepto",
          title: { equals: name },
        },
        {
          property: "Fecha",
          date: { equals: date },
        },
      ],
    },
  });
  return response.results.length > 0;
};

const createMovement = async ({
  category,
  name,
  movementType,
  date,
  month,
  account,
}) => {
  const exists = await existsMovement(name, date);

  if (exists) {
    return;
  }

  await notion.pages.create({
    parent: { database_id: MOVEMENTS_DB_ID },
    properties: {
      Fecha: {
        date: { start: date },
      },
      "Tipo de Movimiento": {
        select: { name: movementType },
      },
      Concepto: {
        title: [{ text: { content: name } }],
      },
      Fijo: {
        checkbox: true,
      },
      Categoría: {
        relation: [{ id: category }],
      },
      Mes: {
        relation: [{ id: month }],
      },
      Cuenta: {
        relation: [{ id: account }],
      },
    },
  });
};

(async () => {
  const now = dayjs();
  const currentMonth = now.format("YYYY-MM");

  const monthName = `${months[now.format("MMMM")]}-${now.format("YYYY")}`;

  const fixedExpenses = await getFixedTxs(FIXED_EXPENSES_DB_ID, now);
  const fixedIncomes = await getFixedTxs(FIXED_INCOMES_DB_ID, now);

  const month = await getMonthOrCreate(monthName);

  for (const item of fixedExpenses.results) {
    const properties = item.properties;
    const day = properties["Día del mes"].number;
    const date = dayjs(`${currentMonth}-${day < 10 ? `0${day}` : day}`).format(
      "YYYY-MM-DD"
    );

    await createMovement({
      category: properties["Categoría"].relation[0].id,
      name: properties["Nombre"].title[0].plain_text,
      movementType: "Egreso",
      date,
      month,
      account: properties["Cuenta"].relation[0].id,
    });
  }

  for (const item of fixedIncomes.results) {
    const properties = item.properties;
    const day = properties["Día del mes"].number;
    const date = dayjs(`${currentMonth}-${day < 10 ? `0${day}` : day}`).format(
      "YYYY-MM-DD"
    );

    await createMovement({
      category: properties["Categoría"].relation[0].id,
      name: properties["Nombre"].title[0].plain_text,
      movementType: "Ingreso",
      date,
      month,
      account: properties["Cuenta"].relation[0].id,
    });
  }
})();
