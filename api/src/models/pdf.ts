// Copyright 2021 Touca, Inc. Subject to Apache-2.0 License.

import Lambda from 'aws-sdk/clients/lambda'
import { readFileSync } from 'fs'
import mustache from 'mustache'
import path from 'path'

import { ComparisonFunctions } from '@/controllers/comparison'
import { UserMap } from '@/models/usermap'
import { BatchModel, IBatchDocument } from '@/schemas/batch'
import { ISuiteDocument } from '@/schemas/suite'
import { config } from '@/utils/config'

interface PdfContent {
  suite: {
    name: string
  }
  dstBatch: {
    name: string
  }
  srcBatch: {
    name: string
    submittedAt: string
    submittedBy: {
      name: string
    }
    fresh: {
      hasCases: boolean
      cases: {
        name: string
      }[]
    }
    missing: {
      hasCases: boolean
      cases: {
        name: string
      }[]
    }
    behavior: {
      hasCases: boolean
      cases: {
        name: string
        matchRate: string
      }[]
    }
    duration: {
      value: string
      change: string
      hasCases: boolean
      cases: {
        name: string
        value: string
        change: string
      }[]
    }
  }
}

interface PdfReport {
  content: Buffer
  contentType: string
  contentDisposition: string
  filename: string
}

async function buildPdfContent(
  suite: ISuiteDocument,
  srcBatch: IBatchDocument
): Promise<PdfContent> {
  const userMap = await new UserMap()
    .addGroup('submittedBy', srcBatch.submittedBy)
    .populate()
  const submittedAt = srcBatch.submittedAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeZone: 'UTC',
    timeStyle: 'long'
  })
  const submittedBy = {
    name: userMap
      .getGroup('submittedBy')
      .map((v) => v.fullname)
      .join(' and ')
  }
  const dstBatch = await BatchModel.findOne(
    { _id: suite.promotions[suite.promotions.length - 1].to },
    { _id: 1, slug: 1 }
  )
  const cmpOutput = await ComparisonFunctions.compareBatch(
    dstBatch._id,
    srcBatch._id
  )
  const differentCases = cmpOutput.common.filter((v) => v.meta.keysScore !== 1)
  const behavior = {
    hasCases: differentCases.length !== 0,
    cases: differentCases.map((v) => ({
      name: v.src.elementName,
      matchRate: Math.floor(v.meta.keysScore * 100).toString() + '%'
    }))
  }
  const duration = {
    value: cmpOutput.overview.metricsDurationHead.toString(),
    change: cmpOutput.overview.metricsDurationChange.toString(),
    hasCases: cmpOutput.common.length !== 0,
    cases: cmpOutput.common.map((v) => ({
      name: v.src.elementName,
      value: v.meta.metricsDurationCommonSrc.toString(),
      change:
        (
          ((v.meta.metricsDurationCommonSrc - v.meta.metricsDurationCommonDst) /
            v.meta.metricsDurationCommonDst) *
          100
        ).toFixed(2) + '%'
    }))
  }
  const fresh = {
    hasCases: cmpOutput.fresh.length !== 0,
    cases: cmpOutput.fresh.map((v) => ({ name: v.elementName }))
  }
  const missing = {
    hasCases: cmpOutput.missing.length !== 0,
    cases: cmpOutput.missing.map((v) => ({ name: v.elementName }))
  }
  const content: PdfContent = {
    suite: {
      name: suite.name
    },
    dstBatch: {
      name: dstBatch.slug
    },
    srcBatch: {
      name: srcBatch.slug,
      submittedAt,
      submittedBy,
      behavior,
      duration,
      fresh,
      missing
    }
  }
  return content
}

export async function buildPdfReport(
  suite: ISuiteDocument,
  batch: IBatchDocument
): Promise<PdfReport> {
  const content = await buildPdfContent(suite, batch)
  const template_file = path.join(
    config.mail.templatesDirectory,
    'reports',
    'report.html'
  )
  const template = readFileSync(template_file, 'utf-8')
  const html = mustache.render(template, { content })

  const params = {
    FunctionName: config.aws.lambdaPdf,
    Payload: JSON.stringify({ html })
  }
  const lambda = new Lambda({
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey
    },
    region: config.aws.region
  })
  const response = await lambda.invoke(params).promise()

  if (response.StatusCode !== 200) {
    return
  }

  const responseBody = JSON.parse(response.Payload.toString()).body
  return {
    content: Buffer.from(responseBody, 'base64'),
    contentType: 'application/pdf',
    contentDisposition: 'attachment',
    filename: [suite.slug, batch.slug].join('_') + '.pdf'
  }
}
