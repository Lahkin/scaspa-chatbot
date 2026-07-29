"""A scripted chat model for exercising the agent without an API key.

`GenericFakeChatModel` cannot carry tool calls through LangGraph's streaming
path, so this implements `BaseChatModel` directly. `bind_tools` returns self, so
whatever script is set is what the agent gets.
"""

from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

USAGE = {"input_tokens": 100, "output_tokens": 20, "total_tokens": 120}


def tool_call(name: str, args: dict | None = None, call_id: str = "call-1") -> AIMessage:
    """An assistant turn that calls one tool."""
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args or {}, "id": call_id}],
        usage_metadata=USAGE,
    )


def says(text: str) -> AIMessage:
    """An assistant turn that answers."""
    return AIMessage(content=text, usage_metadata=USAGE)


class ScriptedModel(BaseChatModel):
    """Returns pre-set replies in order; repeats the last one if it runs out.

    Records every message list it was sent under `state["calls"]`, so tests can
    assert what actually reached the model (system prompt, injected date).
    """

    replies: list[AIMessage] = []
    state: dict[str, Any] = {}

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":  # noqa: ARG002
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:  # noqa: ANN001, ARG002
        self.state.setdefault("calls", []).append(list(messages))
        index = self.state.setdefault("n", 0)
        self.state["n"] = index + 1
        reply = self.replies[min(index, len(self.replies) - 1)]
        return ChatResult(generations=[ChatGeneration(message=reply)])

    @property
    def calls(self) -> list[list[Any]]:
        """Message lists this model received, in order."""
        return self.state.get("calls", [])


def scripted(*replies: AIMessage) -> ScriptedModel:
    """Build a model from a sequence of replies, with fresh call state."""
    return ScriptedModel(replies=list(replies), state={})


def searches_then_says(text: str, query: str = "lookup") -> ScriptedModel:
    """The common shape: one knowledge-base search, then an answer.

    Used wherever a test cares about what the backend does with an answer rather
    than about tool choice.
    """
    return scripted(tool_call("search_scaspa_knowledge", {"query": query}), says(text))


class ExplodingModel(BaseChatModel):
    """Fails the test if the agent ever calls it."""

    @property
    def _llm_type(self) -> str:
        return "exploding"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ExplodingModel":  # noqa: ARG002
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:  # noqa: ANN001, ARG002
        raise AssertionError("the model must not be called for this question")


class AlwaysCallsTool(BaseChatModel):
    """Never stops calling a tool — the runaway the cap exists to stop."""

    tool_name: str = "search_scaspa_knowledge"
    state: dict[str, Any] = {}

    @property
    def _llm_type(self) -> str:
        return "always-calls-tool"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "AlwaysCallsTool":  # noqa: ARG002
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:  # noqa: ANN001, ARG002
        index = self.state.setdefault("n", 0)
        self.state["n"] = index + 1
        return ChatResult(
            generations=[
                ChatGeneration(
                    message=AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": self.tool_name,
                                "args": {"query": f"attempt {index}"},
                                "id": f"call-{index}",
                            }
                        ],
                        usage_metadata=USAGE,
                    )
                )
            ]
        )
