using Microsoft.AspNetCore.Mvc;
using RoofingCrm.Models.Requests;
using RoofingCrm.Services;

namespace RoofingCrm.Controllers;

[ApiController]
[Route("api/search")]
public sealed class SearchPromptController : ControllerBase
{
    private readonly IRagSearchService _ragSearch;
    private readonly ILogger<SearchPromptController> _logger;

    public SearchPromptController(IRagSearchService ragSearch, ILogger<SearchPromptController> logger)
    {
        _ragSearch = ragSearch;
        _logger = logger;
    }

    [HttpPost("prompt")]
    public async Task<IActionResult> SubmitPrompt(
        [FromBody] SearchPromptRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
        {
            return BadRequest(new { error = "Prompt is required." });
        }

        try
        {
            var result = await _ragSearch.SearchAsync(request, cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Semantic search failed.");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}