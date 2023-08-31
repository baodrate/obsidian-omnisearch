import {
  highlightClass,
  type SearchMatch,
  regexLineSplit,
  regexYaml,
  getChsSegmenter,
  SPACE_OR_PUNCTUATION_UNIQUE,
  regexStripQuotes,
  excerptAfter,
  excerptBefore,
} from 'src/globals'
import { settings } from 'src/settings'
import { escapeRegex, warnDebug } from './utils'
import type { Query } from 'src/search/query'
import { Notice } from 'obsidian'

export function highlighterGroups(_substring: string, ...args: any[]) {
  // args[0] is the single char preceding args[1], which is the word we want to highlight
  if (!!args[1].trim())
    return `<span>${args[0]}</span><span class="${highlightClass}">${args[1]}</span>`
  return '&lt;no content&gt;'
}

export function highlightText(text: string, matches: SearchMatch[]): string {
  matches.forEach(matchInfo => {
    const matchRegex = new RegExp(`\\b${matchInfo.match}\\b`, 'giu')
    const matchOffsets = []

    let match
    while ((match = matchRegex.exec(text)) !== null) {
      matchOffsets.push({ index: match.index, text: match[0] })
    }

    if (!matchOffsets.length) {
      return text
    }

    const closestMatch = matchOffsets.reduce((prev, curr) => {
      return Math.abs(curr.index - matchInfo.offset) <
        Math.abs(prev.index - matchInfo.offset)
        ? curr
        : prev
    })

    if (matchOffsets.includes(closestMatch)) {
      const originalMatch = closestMatch.text
      text =
        text.substring(0, closestMatch.index) +
        `<span class="${highlightClass}">` +
        originalMatch +
        '</span>' +
        text.substring(closestMatch.index + originalMatch.length)
    }
  })

  return text
}

export function escapeHTML(html: string): string {
  return html
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function splitLines(text: string): string[] {
  return text.split(regexLineSplit).filter(l => !!l && l.length > 2)
}

export function removeFrontMatter(text: string): string {
  // Regex to recognize YAML Front Matter (at beginning of file, 3 hyphens, than any charecter, including newlines, then 3 hyphens).
  return text.replace(regexYaml, '')
}

/**
 * Used to find excerpts in a note body, or select which words to highlight
 */
export function stringsToRegex(strings: string[]): RegExp {
  if (!strings.length) return /^$/g

  // sort strings by decreasing length, so that longer strings are matched first
  strings.sort((a, b) => b.length - a.length)

  const joined =
    '(' +
    // Default word split is not applied if the user uses the cm-chs-patch plugin
    (getChsSegmenter()
      ? ''
      : // Split on start of line, spaces, punctuation, or capital letters (for camelCase)
      // We also add the hyphen to the list of characters that can split words
      settings.splitCamelCase
      ? `^|${SPACE_OR_PUNCTUATION_UNIQUE.source}|\-|[A-Z]`
      : `^|${SPACE_OR_PUNCTUATION_UNIQUE.source}|\-`) +
    ')' +
    `(${strings.map(s => escapeRegex(s)).join('|')})`

  const reg = new RegExp(`${joined}`, 'gu')
  return reg
}

export function getMatches(
  text: string,
  reg: RegExp,
  query?: Query
): SearchMatch[] {
  text = text.toLowerCase()
  const startTime = new Date().getTime()
  let match: RegExpExecArray | null = null
  let matches: SearchMatch[] = []
  let count = 0
  while ((match = reg.exec(text)) !== null) {
    // Avoid infinite loops, stop looking after 100 matches or if we're taking too much time
    if (++count >= 100 || new Date().getTime() - startTime > 50) {
      warnDebug('Stopped getMatches at', count, 'results')
      break
    }
    const m = match[2]
    if (m && match.index >= 0) {
      matches.push({ match: m, offset: match.index + 1 })
    }
  }

  // If the query can be found "as is" in the text, put this match first
  if (query) {
    const best = text.indexOf(query.segmentsToStr())
    if (best > -1 && matches.find(m => m.offset === best)) {
      matches = matches.filter(m => m.offset !== best)
      matches.unshift({
        offset: best,
        match: query.segmentsToStr(),
      })
    }
  }

  return matches
}

export function makeExcerpt(
  content: string,
  offset: number
): { content: string; offset: number } {
  try {
    const pos = offset ?? -1
    const from = Math.max(0, pos - excerptBefore)
    const to = Math.min(content.length, pos + excerptAfter)
    if (pos > -1) {
      content =
        (from > 0 ? '…' : '') +
        content.slice(from, to).trim() +
        (to < content.length - 1 ? '…' : '')
    } else {
      content = content.slice(0, excerptAfter)
    }
    if (settings.renderLineReturnInExcerpts) {
      const lineReturn = new RegExp(/(?:\r\n|\r|\n)/g)
      // Remove multiple line returns
      content = content
        .split(lineReturn)
        .filter(l => l)
        .join('\n')

      const last = content.lastIndexOf('\n', pos - from)

      if (last > 0) {
        content = content.slice(last)
      }
    }

    content = escapeHTML(content)

    if (settings.renderLineReturnInExcerpts) {
      content = content.trim().replaceAll('\n', '<br>')
    }

    return { content: content, offset: pos }
  } catch (e) {
    new Notice(
      'Omnisearch - Error while creating excerpt, see developer console'
    )
    console.error(`Omnisearch - Error while creating excerpt`)
    console.error(e)
    return { content: '', offset: -1 }
  }
}

/**
 * splits a string in words or "expressions in quotes"
 * @param str
 * @returns
 */
export function splitQuotes(str: string): string[] {
  return (
    str
      .match(/"(.*?)"/g)
      ?.map(s => s.replace(/"/g, ''))
      .filter(q => !!q) ?? []
  )
}

export function stripSurroundingQuotes(str: string): string {
  return str.replace(regexStripQuotes, '')
}
