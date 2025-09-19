import { useState, useEffect } from 'react'
import { Text } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'
import * as SQLite from 'expo-sqlite'

async function testDb() {
  const db = await SQLite.openDatabaseAsync('databaseName')

  // `execAsync()` is useful for bulk queries when you want to execute altogether.
  // Note that `execAsync()` does not escape parameters and may lead to SQL injection.
  await db.execAsync(/* sql */ `
PRAGMA journal_mode = WAL;
DROP TABLE IF EXISTS test;
CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER);
INSERT INTO test (value, intValue) VALUES ('test1', 123);
INSERT INTO test (value, intValue) VALUES ('test2', 456);
INSERT INTO test (value, intValue) VALUES ('test3', 789);
`)

  // `runAsync()` is useful when you want to execute some write operations.
  await db.runAsync(
    /* sql */ `INSERT INTO test (value, intValue) VALUES (?, ?)`,
    'aaa',
    100
  )
  await db.runAsync(
    /* sql */ `UPDATE test SET intValue = ? WHERE value = ?`,
    999,
    'aaa'
  ) // Binding unnamed parameters from variadic arguments
  await db.runAsync(/* sql */ `UPDATE test SET intValue = ? WHERE value = ?`, [
    999,
    'aaa'
  ]) // Binding unnamed parameters from array
  await db.runAsync(/* sql */ `DELETE FROM test WHERE value = $value`, {
    $value: 'aaa'
  }) // Binding named parameters from object

  console.log('===')
  console.log('id', 'value', 'intValue')
  for await (const row of db.getEachAsync(
    'SELECT * FROM test'
  ) as AsyncIterableIterator<any>) {
    console.log(row.id, row.value, row.intValue)
  }
}

export default function () {
  const [response, setResponse] = useState<string | null>(null)

  useEffect(() => {
    const worklet = new Worklet()

    const source = /* js */ `
const { IPC } = BareKit

IPC.on('data', (data) => console.log(data.toString()))
IPC.write(Buffer.from('Hello from bare!'))
`

    worklet.start('/app.js', source)

    const { IPC } = worklet

    // @ts-ignore
    IPC.on('data', (data: Uint8Array) => setResponse(b4a.toString(data)))
    // @ts-ignore
    IPC.write(b4a.from('Hello from React Native!'))

    testDb()
  }, [])

  return <Text>{response}</Text>
}
