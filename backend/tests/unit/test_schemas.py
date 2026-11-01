import pytest
from pydantic import ValidationError

from planner.schemas import (
    BulkRequest,
    ProjectCreate,
    TagCreate,
    TagUpdate,
    TaskCreate,
    TaskUpdate,
    normalise_tag_name,
)


class TestTagNormalisation:
    @pytest.mark.parametrize(
        ("raw", "expected"), [("Work", "work"), ("#Work", "work"), ("  #a-b ", "a-b")]
    )
    def test_normalise(self, raw: str, expected: str):
        assert normalise_tag_name(raw) == expected

    @pytest.mark.parametrize("raw", ["", "#", "   ", "two words"])
    def test_invalid(self, raw: str):
        with pytest.raises(ValueError, match="tag name"):
            normalise_tag_name(raw)

    def test_tag_create_applies_normalisation(self):
        assert TagCreate(name="#Home").name == "home"

    def test_tag_update_allows_missing_name(self):
        assert TagUpdate(color="#123456").name is None

    def test_tag_create_rejects_bad_color(self):
        with pytest.raises(ValidationError):
            TagCreate(name="x", color="red")


class TestTaskSchemas:
    def test_title_is_stripped(self):
        assert TaskCreate(title="  hi  ").title == "hi"

    def test_blank_title_rejected(self):
        with pytest.raises(ValidationError):
            TaskCreate(title="   ")

    def test_tags_deduplicated_and_normalised(self):
        assert TaskCreate(title="t", tags=["#A", "a", "B"]).tags == ["a", "b"]

    def test_update_tracks_explicitly_set_fields(self):
        upd = TaskUpdate(due_date=None)
        assert upd.model_dump(exclude_unset=True) == {"due_date": None}

    def test_update_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            TaskUpdate.model_validate({"nope": 1})

    def test_estimate_must_be_non_negative(self):
        with pytest.raises(ValidationError):
            TaskCreate(title="t", estimate_minutes=-1)


class TestProjectSchemas:
    def test_name_is_stripped(self):
        assert ProjectCreate(name="  Home ").name == "Home"

    def test_default_color(self):
        assert ProjectCreate(name="x").color.startswith("#")


class TestBulkRequest:
    def test_set_status_requires_status(self):
        with pytest.raises(ValidationError, match="status"):
            BulkRequest(ids=[1], action="set_status")

    def test_add_tag_requires_tag(self):
        with pytest.raises(ValidationError, match="tag"):
            BulkRequest(ids=[1], action="add_tag")

    def test_add_tag_normalises(self):
        assert BulkRequest(ids=[1], action="add_tag", tag="#Foo").tag == "foo"

    def test_ids_required(self):
        with pytest.raises(ValidationError):
            BulkRequest(ids=[], action="delete")

    def test_delete_needs_no_payload(self):
        assert BulkRequest(ids=[1, 2], action="delete").action == "delete"
