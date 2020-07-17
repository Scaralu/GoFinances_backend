import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import { In, getCustomRepository, getRepository } from 'typeorm';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string
}

class ImportTransactionsService {
  async execute(csvFilePath: string): Promise<Transaction[]> {
    const contactsReadStream = fs.createReadStream(csvFilePath);

    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const parse = csvParse({
      from_line: 2,
    });

    const parseCsv = contactsReadStream.pipe(parse);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCsv.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if ( !title || !type || !value ) return;

      categories.push(category);

      transactions.push({ title, value, type, category });
    })

    await new Promise(resolve => parseCsv.on('end', resolve));

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      }
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      }))
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transactions => ({
          title: transactions.title,
          type: transactions.type,
          value: transactions.value,
          category: finalCategories.find(
            category => category.title === transactions.category,
          ),
        })),
      );

      await transactionsRepository.save(createdTransactions);

      await fs.promises.unlink(csvFilePath);

      return createdTransactions;
  }
}

export default ImportTransactionsService;
