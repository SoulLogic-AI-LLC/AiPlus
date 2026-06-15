import { createSignal, onMount, Show } from "solid-js"
import { useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"

type AgentInfo = { name: string; description?: string; native?: boolean }

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()
  const toast = useToast()
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

  const CEO_PATTERN = /^CEO(-\d)?$/

  const options = () => {
    const list = agents()
    const hasCEO = list.some((a) => CEO_PATTERN.test(a.name))
    const items = list.map((item) => ({
      value: item.name,
      title: item.name,
      description: item.native ? "native" : (item.description ?? ""),
    }))
    if (!hasCEO) {
      items.unshift({
        value: "",
        title: "CEO (all lanes occupied — 3/3 in use)",
        description: "Close a CEO session to free a lane.",
      })
    }
    return items
  }

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current()?.name}
      options={options()}
      onSelect={(option) => {
        if (!option.value) {
          toast.show({ variant: "warning", message: "All CEO lanes in use (3/3). Close a CEO session to free a lane.", duration: 4000 })
          return
        }
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
