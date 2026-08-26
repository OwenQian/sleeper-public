import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { parseRankingsImport } from '../lib/rankingsImport'
import { RankingsImportPanel } from './RankingsImportPanel'

const header = 'Overall,Player,Position,Pos Rank,Tier,Auction (Out of $200)'
const currentCsv = `${header}
1,Existing Runner,RB,1,1,$50`
const importCsv = `${header}
1,Existing Runner,RB,1,1,$55
2,New Receiver,WR,1,2,$42`

function csvFile(contents: string, name = 'rankings.csv'): File {
  const file = new File([contents], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn().mockResolvedValue(contents),
  })
  return file
}

function renderPanel(onApply = vi.fn(), onClose = vi.fn()) {
  render(
    <RankingsImportPanel
      currentPlayers={parseRankingsImport(currentCsv)}
      onApply={onApply}
      onClose={onClose}
    />,
  )
  return { onApply, onClose }
}

describe('RankingsImportPanel', () => {
  it('previews a dropped CSV and applies it only after confirmation', async () => {
    const user = userEvent.setup()
    const { onApply } = renderPanel()

    fireEvent.drop(screen.getByRole('button', { name: 'Drop rankings CSV here or choose a file' }), {
      dataTransfer: { files: [csvFile(importCsv)] },
    })

    const preview = await screen.findByRole('region', { name: 'Import preview' })
    expect(preview).toHaveTextContent('2 players')
    expect(preview).toHaveTextContent('1 matched')
    expect(preview).toHaveTextContent('1 added')
    expect(preview).toHaveTextContent('0 retained')
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Apply import' }))

    expect(onApply).toHaveBeenCalledOnce()
    expect(onApply.mock.calls[0][0].map((player: { name: string }) => player.name))
      .toEqual(['Existing Runner', 'New Receiver'])
  })

  it('supports selecting a CSV from the hidden file picker', async () => {
    const { onApply } = renderPanel()

    fireEvent.change(screen.getByLabelText('Choose rankings CSV'), {
      target: { files: [csvFile(importCsv)] },
    })

    expect(await screen.findByText('Ready to import')).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('shows parser errors without applying changes', async () => {
    const user = userEvent.setup()
    const { onApply } = renderPanel()

    fireEvent.drop(screen.getByRole('button', { name: 'Drop rankings CSV here or choose a file' }), {
      dataTransfer: { files: [csvFile('Player,Overall\nBroken,1')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Required CSV headers')
    expect(screen.getByRole('button', { name: 'Apply import' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Apply import' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('rejects non-CSV file names before reading them', async () => {
    renderPanel()

    fireEvent.drop(screen.getByRole('button', { name: 'Drop rankings CSV here or choose a file' }), {
      dataTransfer: { files: [csvFile(importCsv, 'rankings.txt')] },
    })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a .csv file'))
  })
})
