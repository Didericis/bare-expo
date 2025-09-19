import { useState, useEffect } from 'react'
import { Text } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import { ScrollView } from 'react-native'
import b4a from 'b4a'
import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'
import { LlamaContext } from 'llama.rn'
import { loadModel, sendMessage } from '@/@/llama/llama.config'
import {
  IOS_LIBRARY_PATH, // Default iOS
  ANDROID_DATABASE_PATH, // Default android
  open
} from '@op-engineering/op-sqlite'

const chatModelDownload =
  'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf'
const embedModelDownload =
  'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q6_K.gguf'

async function testDb(
  vec1: number[],
  vec2: number[],
  vec3: number[],
  queryVec: number[]
) {
  const db = open({
    name: 'myDB',
    location: Platform.OS === 'ios' ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH
  })

  // `execAsync()` is useful for bulk queries when you want to execute altogether.
  // Note that `execAsync()` does not escape parameters and may lead to SQL injection.
  try {
    await db.execute(/* sql */ `\
DROP TABLE IF EXISTS embeddings;
CREATE VIRTUAL TABLE embeddings USING vec0(embedding float[768]);
INSERT INTO embeddings (rowid, embedding) VALUES
  (1, '${JSON.stringify(vec1)}'),
  (2, '${JSON.stringify(vec2)}'),
  (3, '${JSON.stringify(vec3)}');
`)
  } catch (e) {
    console.error(e)
  }

  const results = await db.execute(/* sql */ `\
select
  rowid,
  distance
from embeddings
where embedding match '${JSON.stringify(queryVec)}'
order by distance
limit 3;
`)
  console.log('RESULTS', results)

  // // `runAsync()` is useful when you want to execute some write operations.
  // await db.runAsync(
  //   /* sql */ `INSERT INTO test (value, intValue) VALUES (?, ?)`,
  //   'aaa',
  //   100
  // )
  // await db.runAsync(
  //   /* sql */ `UPDATE test SET intValue = ? WHERE value = ?`,
  //   999,
  //   'aaa'
  // ) // Binding unnamed parameters from variadic arguments
  // await db.runAsync(/* sql */ `UPDATE test SET intValue = ? WHERE value = ?`, [
  //   999,
  //   'aaa'
  // ]) // Binding unnamed parameters from array
  // await db.runAsync(/* sql */ `DELETE FROM test WHERE value = $value`, {
  //   $value: 'aaa'
  // }) // Binding named parameters from object

  // console.log('===')
  // console.log('id', 'value', 'intValue')
  // for await (const row of db.getEachAsync(
  //   'SELECT * FROM test'
  // ) as AsyncIterableIterator<any>) {
  //   console.log(row.id, row.value, row.intValue)
  // }
}

export default function () {
  const [chatReply, setChatReply] = useState<string | null>(null)
  const [response, setResponse] = useState<string | null>(null)
  const [_llamaChatContext, setLlamaChatContext] = useState<
    LlamaContext | null | undefined
  >(null)
  const [_llamaEmbedContext, setLlamaEmbedContext] = useState<
    LlamaContext | null | undefined
  >(null)

  const downloadChatModelResumable = FileSystem.createDownloadResumable(
    chatModelDownload,
    FileSystem.documentDirectory + 'chatmodel.gguf',
    {},
    (progress) => {
      console.log('downloading chat model', progress)
    }
  )
  const downloadChatModel = async () => {
    try {
      const isExists = (
        await FileSystem.getInfoAsync(
          FileSystem.documentDirectory + 'chatmodel.gguf'
        )
      ).exists
      if (isExists) {
        console.log('Loaded existing chat model')
        const llamaChatContext = await loadModel(
          FileSystem.documentDirectory + 'chatmodel.gguf'
        )
        setLlamaChatContext(llamaChatContext)

        return llamaChatContext
      }

      const res = await downloadChatModelResumable.downloadAsync()

      if (!res?.uri) {
        console.log('no uri')
      }

      const llamaChatContext = await loadModel(res?.uri!)
      console.log('Loaded new chat model')
      setLlamaChatContext(llamaChatContext)
      return llamaChatContext
    } catch (e) {
      console.error(e)
    }
  }

  // embed model
  const downloadEmbedModelResumable = FileSystem.createDownloadResumable(
    embedModelDownload,
    FileSystem.documentDirectory + 'embedmodel.gguf',
    {},
    (progress) => {
      console.log('downloading embed model:', progress)
    }
  )
  const downloadEmbedModel = async () => {
    try {
      const isExists = (
        await FileSystem.getInfoAsync(
          FileSystem.documentDirectory + 'embedmodel.gguf'
        )
      ).exists
      if (isExists) {
        const llamaEmbedContext = await loadModel(
          FileSystem.documentDirectory + 'embedmodel.gguf',
          true
        )
        console.log('Loaded existing embed model')
        setLlamaEmbedContext(llamaEmbedContext)

        return llamaEmbedContext
      }

      const res = await downloadEmbedModelResumable.downloadAsync()
      console.log('Finished downloading to ', res?.uri)

      if (!res?.uri) {
        console.log('no uri')
      }

      const llamaEmbedContext = await loadModel(res?.uri!)
      console.log('Loaded new embed model')
      setLlamaEmbedContext(llamaEmbedContext)
      return llamaEmbedContext
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const worklet = new Worklet()

    const source = /* js */ `
const { IPC } = BareKit

IPC.on('data', (data) => console.log(data.toString()))
IPC.write(Buffer.from('Hello from bare! Now asking a model what the capital of the USA is:'))
`

    worklet.start('/app.js', source)

    const { IPC } = worklet

    // @ts-ignore
    IPC.on('data', (data: Uint8Array) => setResponse(b4a.toString(data)))
    // @ts-ignore
    IPC.write(b4a.from('Hello from React Native!'))

    downloadEmbedModel().then(async (ctx) => {
      console.log('Can now (theoretically) embed text!')
      if (ctx) {
        console.log('Start embedding')
        const { embedding } = await ctx.embedding('Hello, world!')
        const { embedding: embedding2 } = await ctx.embedding(`
# Arch Linux Network Setup

https://serverfault.com/questions/986231/cannot-ssh-or-ping-hostname-but-dig-and-nslookup-work-on-ubuntu-18-04

https://serverfault.com/questions/986231/cannot-ssh-or-ping-hostname-but-dig-and-nslookup-work-on-ubuntu-18-04

\`\`\`
vim /etc/dhcpcd.conf
# add "nohook resolve.conf"
vim /etc/resolv.conf
# add "nameserver 8.8.8.8

vim /etc/nsswitch.conf
# change hosts to "files dns"
\`\`\`


\`\`\`
mdadm --detail /dev/md127
pvscan
vgscan
vgchange -ay
lvscan
mount /dev/vg1000/lv synology
\`\`\`
`)

        const { embedding: embedding3 } = await ctx.embedding(`
# 19:39

I’d like full freedom to make a prettier UX than what just html forms and css limits me to. This ethos of “progressive enhancement” I’m going for feels like a waste. Why spend the time to make things work on non javascript enabled browsers? Everyone uses javascript at this point. And I believe I’m using css that means I no longer can use an ancient browser like I wanted.

Counters:

1. HTML and CSS are as close to a “static universal UI language” that we currently have. The standard is *extremely* ubiquitous, and it means that a TextOrbium frontend could (theoretically) be constructed without being shipped with chip specific source code or implicitly requiring a long and complex compilation toolchain.
2. Any dynamic javascript creates a possibility for security exploits. If the UI truly executes *nothing*/is just interpreting static documents, then the security threshold is dramatically reduced. It also means you could construct an actually secure machine built from the ground up on your own supply chain.
`)

        const { embedding: queryEmbedding } = await ctx.embedding(`\
Setting up a network connection on arch linux
`)
        console.log('End embedding')
        console.log('Adding to db...')
        await testDb(embedding, embedding2, embedding3, queryEmbedding)
        console.log('Set up db')
      } else {
        console.error('llama context for embeds could not be loaded')
      }
    })

    downloadChatModel().then(async (ctx) => {
      if (ctx) {
        console.log('Ready to ask questions!')
        // let chatReply = ''
        // sendMessage(ctx, 'What is the capital of the USA', (token) => {
        //   chatReply += token
        //   setChatReply(chatReply)
        // })
        // console.log('=== REPLY ===')
        // console.log(text)
      } else {
        console.error('llama context for chat could not be loaded')
      }
    })
    // testDb()
  }, [])

  return (
    <ScrollView>
      <Text>{response}</Text>
      <Text>{chatReply}</Text>
    </ScrollView>
  )
}
