import { createSignal, onMount, Show } from "solid-js"
import { useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"

type AgentInfo = { name: string; description?: string; native?: boolean }

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()
  const sdk = useSDK()
  const project = useProject()

  // Fetch fresh agent list from server (picks up lease-based CEO lane changes)
  const [freshAgents, setFreshAgents] = createSignal<AgentInfo[] | null>(null)
  onMount(() => {
    const workspace = project.workspace.current()
    if (!workspace) return
    sdk.client.app
      .agents({ workspace }, { throwOnError: true })
      .then((res) => {
        if (res.data) setFreshAgents(res.data as AgentInfo[])
      })
      .catch(() => {})
  })

  const agents = () => freshAgents() ?? local.agent.list()

  const options = () =>
    agents().map((item) => ({
      value: item.name,
      title: item.name,
      description: item.native ? "native" : (item.description ?? ""),
    }))

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current()?.name}
      options={options()}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
